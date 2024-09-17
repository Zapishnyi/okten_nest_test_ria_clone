import {
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';

import { UserEntity } from '../../../database/entities/user.entity';
import { IUserData } from '../../auth/interfaces/IUserData';
import { AuthService } from '../../auth/services/auth.service';
import { AuthAccessService } from '../../auth/services/auth-access.service';
import { FileContentTypeEnum } from '../../aws-storage/enums/file-content-type.enum';
import { AwsStorageService } from '../../aws-storage/services/aws-storage.service';
import { UserRepository } from '../../repository/services/user-repository.service';
import { GetUsersQueryReqDto } from '../dto/req/getUsersQuery.req.dto';
import { UserSelfCreateReqDto } from '../dto/req/user-self-create.req.dto';
import { UserUpdateReqDto } from '../dto/req/user-update.req.dto';
import { UserResDto } from '../dto/res/user.res.dto';
import { AdminRoleEnum } from '../enums/user-role.enum';
import { UserPresenterService } from './user-presenter.service';

@Injectable()
// @Injectable() you're declaring that this class can be managed by the NestJS IoC
// (Inversion of Control) container. This allows NestJS to handle the lifecycle of
// the class and inject it wherever it's needed.
export class UsersService {
  constructor(
    /*Integration of methods/services from sabling modules*/
    // public readonly postService: PostsService,
    public readonly userRepository: UserRepository,
    public readonly authAccessService: AuthAccessService,
    @Inject(forwardRef(() => AuthService))
    private readonly authService: AuthService,
    private readonly awsStorageService: AwsStorageService,
    private readonly userPresenter: UserPresenterService,
  ) {}

  public async getUsers(
    userData: IUserData,
    query: GetUsersQueryReqDto,
  ): Promise<[UserEntity[], number]> {
    return await this.userRepository.getUsers(userData, query);
  }

  public async updateUser(
    userData: IUserData,
    dto: UserUpdateReqDto,
    userId: string,
  ): Promise<UserEntity> {
    const user = await this.userRepository.findOneBy({ id: userId });
    if (userData.user.role === AdminRoleEnum.ADMIN && dto.role) {
      this.userRepository.merge(user, dto);
    } else {
      this.userRepository.merge(user, { ...dto, role: user.role });
    }
    return await this.userRepository.save(user);
  }

  public async findMe({ user }: IUserData): Promise<UserResDto> {
    const userFound = await this.userRepository.findOneBy({
      id: user.id,
    });
    return this.userPresenter.toResponseDto(userFound);
  }

  public async updateMe(
    UserData: IUserData,
    // ToDo
    updateUserDto: any,
  ): Promise<UserEntity> {
    const user = await this.userRepository.findOneBy({ id: UserData.user.id });
    this.userRepository.merge(user, updateUserDto);
    return await this.userRepository.save(user);
  }

  public async createUser(dto: UserSelfCreateReqDto): Promise<UserEntity> {
    await this.isEmailExistOrThrow(dto.email);
    const password = await bcrypt.hash(dto.password, 10);
    return await this.userRepository.save(
      this.userRepository.create({ ...dto, password }),
    );
  }

  public async removeMe({ device, user }: IUserData): Promise<void> {
    await this.userRepository.delete({ id: user.id });
    // not needed because in entity onDelete:'CASCADE' option used
    // await this.authService.signOut(userData);
    await this.authAccessService.deleteToken(user.id, device);
  }

  public async findOne(id: string): Promise<UserEntity> {
    const user = await this.userRepository.findOneBy({ id });
    if (!user) {
      throw new NotFoundException('User does not exist');
    }
    return user;
  }

  public async isEmailExistOrThrow(email: string): Promise<void> {
    const user = await this.userRepository.findOneBy({ email });
    if (user) {
      throw new ConflictException('User already exists');
    }
  }

  public async uploadAvatar(
    { user }: IUserData,
    avatar: Express.Multer.File,
  ): Promise<void> {
    const avatarPath = await this.awsStorageService.uploadFile(
      avatar,
      FileContentTypeEnum.AVATAR,
      user.id,
    );
    await this.userRepository.update(user.id, { avatar_image: avatarPath });
  }

  public async deleteAvatar({ user }: IUserData): Promise<void> {
    const filePath = (await this.userRepository.findOneBy({ id: user.id }))
      .avatar_image;
    await this.awsStorageService.deleteFile(filePath);
    await this.userRepository.update(user.id, { avatar_image: null });
  }
}
